const { LocalWorkspace } = require("@pulumi/pulumi/automation");
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const { createSecurityGroup } = require("./security-group");
const { createInstance } = require("./instance");
const { createStartupScript } = require("./startup-script");
const { fetchToken } = require("./token-fetcher");
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const _ = require('lodash');

const RETRY_MAX = 10;
const RETRY_INTERVAL = 30000;
const MAX_STACK_AGE_IN_MILLIS = (process.env.MAX_STACK_AGE_IN_MINUTES * 60 * 1000)
const MAX_STATE_FILE_AGE_IN_MILLIS = (process.env.MAX_STATE_FILE_AGE_IN_MINUTES * 60 * 1000)

const createOrDelete = async (context, action, stackName, config) => {
    console.info('About to create/delete infra');

    const pulumiProgram = async () => {
        console.info('fetching token');
        const token = await fetchToken(context, config.owner, config.repo);

        console.info('creating startup script');
        const script = createStartupScript(stackName, config, token);

        console.info('getting caller identity');
        const identity = await aws.getCallerIdentity({});

        console.info('creating security grouo');
        const securityGroup = createSecurityGroup(config.repo);

        console.info('creating instance');
        const runnerInstance = createInstance(identity, securityGroup, script, config);
        return {
            instanceArn: runnerInstance.arn
        };
    };

    console.info('Create/select stack');
    const args = {
        stackName: stackName,
        projectName: `${config.repo}`,
        program: pulumiProgram
    };
    const stack = await LocalWorkspace.createOrSelectStack(args);

    console.info('Installing plugin');
    await stack.workspace.installPlugin("aws", "v6.0.2");
    
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
                console.error(`Attempt ${i+1} failed. Retrying in ${interval}ms...`);
                console.error(`ERROR: ${err}`);
                await stack.cancel();
                console.error("Action cancelled");
                await new Promise(resolve => setTimeout(resolve, interval));
            } else {
                throw new Error(`Action failed after ${maxRetries} attempts! ERROR: ${err}`);
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
                console.error(`Attempt ${i+1} failed. Retrying in ${interval}ms...`);
                console.error(`ERROR: ${err}`);
                await stack.cancel();
                console.error("Action cancelled");
                await new Promise(resolve => setTimeout(resolve, interval));
            } else {
                throw new Error(`Action failed after ${maxRetries} attempts! ERROR: ${err}`);
            }
        }
    }
}

const cleanupRemoteStateFiles = async () => {
    await removeStateFiles();
    console.info('Removing state files done');
}

const executeCleanup = async (app) => {
    try {
        console.info('Executing cleanup');
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
            console.info('Nothing to delete. Skipping...');
            return;
        }

        for (const stack of stacksToDelete) {
            await handleStack(stack);
        }

        console.info('Executing cleanup done');
    } catch (err) {
        console.error(`Error occured while executing cleanup. ERROR: ${err}`);
    }
}

async function handleStack(stack){
    const organisedStackName = getOrganisedStackName(stack);
    console.info(`Stack [${stack.name}] is more than ${process.env.MAX_STACK_AGE_IN_MINUTES} minutes old. Deleting the stack now`);
    try {
        const selectedStack = await LocalWorkspace.selectStack({
            stackName: stack.name,
            projectName: organisedStackName.repo,
            program: async () => {}
        });
        await retryDestroy(selectedStack);
        console.info(`Stack [${stack.name}] deleted`);
    } catch(err){
        console.error(`Error occured while selecting a stack. ERROR: ${err}`);
    }
}

async function removeStateFiles(){
    const bucket = process.env.PULUMI_BACKEND_URL.replace(/^s3:\/\//, '');
    let proceed = true;
    let continuationToken = null;
    const client = new S3Client({ region: process.env.AWS_REGION });

    while(proceed){
        const s3Objects = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken || undefined}));
        proceed = s3Objects.IsTruncated;
        continuationToken = s3Objects.NextContinuationToken;

        const matchingS3Objects = s3Objects.Contents.filter(s3Object => objectIsNotPulumiMeta(s3Object) && objectIsNotLockFile(s3Object) && isDateOlderThan(s3Object.LastModified, MAX_STATE_FILE_AGE_IN_MILLIS));
    
        console.info(`Fetched [${matchingS3Objects.length}] S3 objects to delete`);
        if(_.isEmpty(matchingS3Objects)){
            console.info('No matching objects. Skipping this turn...');
            continue;
        }
    
        let params = {
            Bucket: bucket, 
            Delete: {
                Objects: [], 
                Quiet: false
            }
        };
    
        matchingS3Objects.forEach(matchingS3Object => {
           params.Delete.Objects.push({ Key: matchingS3Object.Key });
        });

        const deleteObjectsResult = await client.send(new DeleteObjectsCommand(params));
        if(deleteObjectsResult.Errors !== undefined && deleteObjectsResult.Errors.length > 0){
            console.error(`ERROR: Failed to delete S3 objects. ${JSON.stringify(deleteObjectsResult.Errors)}`);
        } else {
            deleteObjectsResult.Deleted.forEach(deletedObject => console.log(`Deleted object: ${deletedObject.Key}`));
            console.info(`Successfully deleted S3 objects`);
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