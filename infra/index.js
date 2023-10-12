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

    console.log('Installing plugin');
    await stack.workspace.installPlugin("aws", "v4.0.0");
    
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

const executeCleanup = async (app) => {
    try {
        console.log('Executing cleanup');
        console.log(`Got app: ${JSON.stringify(app)}`);
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
        const registeredRunners = await getRegisteredRunners(app);
        console.log(`Registered runners: ${JSON.stringify(registeredRunners)}`);
        const stacksToDelete = (await ws.listStacks()).filter(stack => shouldDeleteStack(stack, registeredRunners));
        
        if(stacksToDelete.length === 0){
            console.log('Nothing to delete. Skipping...');
            return;
        }

        console.log(`Stacks to delete: ${JSON.stringify(stacksToDelete)}`);
        await Promise.all(stacksToDelete.map(stack => handleStack(stack)));
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

        // console.log(`Next, removing state files from S3 bucket with AWS SDK`); TODO: will be a part of the next PR and removed here as well
        // await removeStateFiles({
        //     fullStakName: stack.name,
        //     repo: organisedStackName.repo,
        //     ghrunnerName: organisedStackName.runner
        // });
        // console.log('Removing state files done');
    } catch(err){
        console.log(`Error occured while selecting a stack. Error: ${err}`);
    }
}

async function removeStateFiles(stackData){
    const bucket = process.env.PULUMI_BACKEND_URL.replace(/^s3:\/\//, '');
    const s3Objects = await s3.listObjectsV2({Bucket: bucket}).promise();
    const matchingS3Objects = s3Objects.Contents.filter(s3Object => s3Object.Key.includes(stackData.ghrunnerName));

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
        console.log(`Successfully deleted S3 objects`);
    }
    
}

function shouldDeleteStack(stack, registeredRunners){
    return !isCurrentlyUpdating(stack) && isOlderThanMaxStackAgeInMillis(stack.lastUpdate) && !runnerIsBusy(stack, registeredRunners);
}

function isCurrentlyUpdating(stack){
    return stack.updateInProgress;
}

function runnerIsBusy(stack, registeredRunners){
    const organisedStackName = getOrganisedStackName(stack);
    const registeredRunner = _.filter(registeredRunners, { 'name': organisedStackName.runner });
    console.log(`Registered runner found: ${JSON.stringify(registeredRunner)}`);
    console.log(`Function will return: ${(registeredRunner !== undefined && registeredRunner != null && registeredRunner.status === "online")}`);
    return (registeredRunner !== undefined && registeredRunner != null && registeredRunner.status === "online");
}

async function getRegisteredRunners(app){
    for await (const { octokit, repository } of app.eachRepository.iterator()) {
        const runners = (await octokit.request('GET /repos/{owner}/{repo}/actions/runners', {
            owner: repository.owner.login,
            repo: repository.name
        })).data.runners;
        return runners;
    }
    return [];
}

function getOrganisedStackName(stack){
    let stackNameComponents = stack.name.split('/');
    return {
        root: stackNameComponents[0],
        repo: stackNameComponents[1],
        runner: stackNameComponents[2]
    };
}

function isOlderThanMaxStackAgeInMillis(lastUpdate) {
    const lastUpdateDate = new Date(lastUpdate);
    const currentDate = new Date();
    const timeDifference = currentDate - lastUpdateDate;
    return timeDifference > MAX_STACK_AGE_IN_MILLIS;
}

module.exports = {
    createOrDelete, executeCleanup
}