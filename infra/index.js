const { LocalWorkspace } = require("@pulumi/pulumi/automation");
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const { createSecurityGroup } = require("./security-group");
const { createInstance } = require("./instance");
const { createStartupScript } = require("./startup-script");
const { fetchToken } = require("./token-fetcher");
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const _ = require('lodash');

const RETRY_MAX = 10;
const RETRY_INTERVAL = 30000;
const MAX_STACK_AGE_IN_MILLIS = (process.env.MAX_STACK_AGE_IN_MINUTES * 60 * 1000)
const MAX_STATE_FILE_AGE_IN_MILLIS = (process.env.MAX_STATE_FILE_AGE_IN_MINUTES * 60 * 1000)

const createOrDelete = async (context, action, stackName, config) => {
    console.log('About to create/delete infra');

    const pulumiProgram = async () => {
        console.log('fetching token');
        const token = await fetchToken(context, config.owner, config.repo);

        console.log('creating startup script');
        const script = createStartupScript(stackName, config, token);

        console.log('getting caller identity');
        const identity = await aws.getCallerIdentity({});

        console.log('creating security grouo');
        const securityGroup = createSecurityGroup(config.repo);

        console.log('creating instance');
        const runnerInstance = createInstance(identity, securityGroup, script, config);
        return {
            instanceArn: runnerInstance.arn
        };
    };

    console.log('Create/select stack');
    const args = {
        stackName: stackName,
        projectName: `${config.repo}`,
        program: pulumiProgram
    };
    const stack = await LocalWorkspace.createOrSelectStack(args);

    // console.log('Installing plugin');
    // await stack.workspace.installPlugin("aws", "v6.0.0");
    
    await stack.setConfig("aws:region", { value: process.env.AWS_REGION });

    console.info("refreshing stack...");
    await retryRefresh(stack);
    console.info("refresh complete");

    if (action === "completed") {
        console.info("Attempting to destroy stack...");
        await retryDestroy(stack);
    } else if (action === "requested") {
        console.info("updating stack...");
        await stack.up({ onOutput: console.info });
        console.info("updating stack complete");
    } else {
        throw new Error(`Unknown action received! Got: [${action}]`);
    }
};

async function retryRefresh(stack, maxRetries = RETRY_MAX, interval = RETRY_INTERVAL) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await stack.refresh();
            return;
        } catch (err) {
            if (i < maxRetries - 1) {
                console.log(`Attempt ${i+1} failed. Retrying in ${interval}ms...`);
                console.log(`Error is: ${err}`);
                await stack.cancel();
                console.log("Action cancelled");
                await new Promise(resolve => setTimeout(resolve, interval));
            } else {
                throw new Error(`Action failed after ${maxRetries} attempts! Error: ${err}`);
            }
        }
    }
}

async function retryDestroy(stack, maxRetries = RETRY_MAX, interval = RETRY_INTERVAL) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await stack.destroy();
            return;
        } catch (err) {
            if (i < maxRetries - 1) {
                console.log(`Attempt ${i+1} failed. Retrying in ${interval}ms...`);
                console.log(`Error is: ${err}`);
                await stack.cancel();
                console.log("Action cancelled");
                await new Promise(resolve => setTimeout(resolve, interval));
            } else {
                throw new Error(`Action failed after ${maxRetries} attempts! Error: ${err}`);
            }
        }
    }
}

const cleanupRemoteStateFiles = async () => {
    await removeStateFiles();
    console.log('Removing state files done');
}

const executeCleanup = async (app) => {
    try {
        console.log('Executing cleanup');
        const registeredRunners = await getRegisteredRunners(app);

        const ws = await LocalWorkspace.create({
            projectSettings: {
                name: pulumi.getProject(),
                runtime: "nodejs",
                backend: {
                    url: process.env.PULUMI_BACKEND_URL
                }
            },
            envVars: {
                "AWS_REGION": process.env.AWS_REGION,
                "PULUMI_BACKEND_URL": process.env.PULUMI_BACKEND_URL
            }
        });
        const stacksToDelete = (await ws.listStacks()).filter(stack => shouldDeleteStack(stack, registeredRunners));
        
        if(stacksToDelete.length === 0){
            console.log('Nothing to delete. Skipping...');
            return;
        }

        // await Promise.all(stacksToDelete.map(stack => handleStack(stack)));

        for (const stack of stacksToDelete) {
            await handleStack(stack);
        }

        console.log('Executing cleanup done');
    } catch (err) {
        console.log(`Error occured while executing cleanup. Error: ${err}`);
    }
}

async function handleStack(stack){
    const organisedStackName = getOrganisedStackName(stack);
    console.log(`Stack [${stack.name}] is more than ${process.env.MAX_STACK_AGE_IN_MINUTES} minutes old. Deleting the stack now`);
    try {
        const selectedStack = await LocalWorkspace.selectStack({
            stackName: stack.name,
            projectName: organisedStackName.repo,
            program: async () => {}
        });
        await retryDestroy(selectedStack);
        console.log(`Stack [${stack.name}] deleted`);
    } catch(err){
        console.log(`Error occured while selecting a stack. Error: ${err}`);
    }
}

async function removeStateFiles(){
    const bucket = process.env.PULUMI_BACKEND_URL.replace(/^s3:\/\//, '');
    let proceed = true;
    let continuationToken = null;

    while(proceed){
        const s3Objects = await s3.listObjectsV2({Bucket: bucket, ContinuationToken: continuationToken || undefined}).promise();
        proceed = s3Objects.IsTruncated;
        continuationToken = s3Objects.NextContinuationToken;

        const matchingS3Objects = s3Objects.Contents.filter(s3Object => objectIsNotPulumiMeta(s3Object) && objectIsNotLockFile(s3Object) && isDateOlderThan(s3Object.LastModified, MAX_STATE_FILE_AGE_IN_MILLIS));
    
        console.log(`Fetched [${matchingS3Objects.length}] S3 objects to delete`);
        if(_.isEmpty(matchingS3Objects)){
            console.log('No matching objects. Skipping this turn...');
            continue;
        }
    
        var params = {
            Bucket: bucket, 
            Delete: {
                Objects: [], 
                Quiet: false
            }
        };
    
        matchingS3Objects.forEach(matchingS3Object => {
           params.Delete.Objects.push({ Key: matchingS3Object.Key });
        });
    
        const deleteObjectsResult = await s3.deleteObjects(params).promise();
        if(deleteObjectsResult.Errors.length > 0){
            console.log(`Failed to delete S3 objects: ${JSON.stringify(deleteObjectsResult.Errors)}`);
        } else {
            deleteObjectsResult.Deleted.forEach(deletedObject => console.log(`Deleted object: ${deletedObject.Key}`));
            console.log(`Successfully deleted S3 objects`);
        }
    }
}

function objectIsNotPulumiMeta(s3Object){
    return !(_.isEqual(s3Object.Key, ".pulumi/meta.yaml"));
}

function objectIsNotLockFile(s3Object){
    return !(_.startsWith(s3Object.Key, ".pulumi/locks"));
}

function shouldDeleteStack(stack, registeredRunners){
    return !isCurrentlyUpdating(stack) && isDateOlderThan(stack.lastUpdate, MAX_STACK_AGE_IN_MILLIS) && !runnerIsBusy(stack, registeredRunners);
}

function isCurrentlyUpdating(stack){
    return stack.updateInProgress;
}

function runnerIsBusy(stack, registeredRunners){
    const organisedStackName = getOrganisedStackName(stack);
    const registeredRunner = _.filter(registeredRunners, { 'name': organisedStackName.runner });
    return (registeredRunner !== undefined && registeredRunner != null && registeredRunner.status === "online" && registeredRunner.busy === true);
}

async function getRegisteredRunners(app){
    let allRunners = [];
    for await (const { octokit, repository } of app.eachRepository.iterator()) {
        const runnersByRepo = (await octokit.request('GET /repos/{owner}/{repo}/actions/runners', {
            owner: repository.owner.login,
            repo: repository.name
        })).data.runners;
        allRunners.push(runnersByRepo);
    }
    return allRunners;
}

function getOrganisedStackName(stack){
    let stackNameComponents = stack.name.split('/');
    return {
        root: stackNameComponents[0],
        repo: stackNameComponents[1],
        runner: stackNameComponents[2]
    };
}

function isDateOlderThan(date, age) {
    const lastUpdateDate = new Date(date);
    const currentDate = new Date();
    const timeDifference = currentDate - lastUpdateDate;
    return timeDifference > age;
}

module.exports = {
    createOrDelete, executeCleanup, cleanupRemoteStateFiles
}