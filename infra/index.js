const { LocalWorkspace } = require("@pulumi/pulumi/automation");
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const { createSecurityGroup } = require("./security-group");
const { createInstance } = require("./instance");
const { createStartupScript } = require("./startup-script");
const { fetchToken } = require("./token-fetcher");

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
        projectName: config.repo,
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
            console.info(`Refresh complete`);
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
            console.info(`Destroy complete`);
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

const executeCleanup = async () => {
    try {
        console.log('Executing cleanup');
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
        const stacks = (await ws.listStacks()).filter(stack => shouldDeleteStack(stack));
        
        if(stacks.length === 0){
            console.log('Nothing to delete. Skipping...');
            return;
        }

        console.log(`Stacks to delete: ${JSON.stringify(stacks)}`);

        const results = await Promise.all(stacks.map(stack => handleStack(stack)));
        console.log(`Results: ${results}`);
        console.log('Executing cleanup done');
    } catch (err) {
        console.log(`Error occured while executing cleanup. Error: ${err}`);
    }
}

async function handleStack(stack){
    let stackNameParts = stack.name.split('/');
    console.log(`Stack [${stack.name}] is more than an ${process.env.MAX_STACK_AGE_IN_MINUTES} minutes old. Deleting the stack now`);
    try {
        const selectedStack = await LocalWorkspace.selectStack({
            stackName: stack.name,
            projectName: stackNameParts[1],
            program: async () => {}
        });
        await retryDestroy(selectedStack);
        console.log(`Stack [${stack.name}] deleted`);
    } catch(err){
        console.log(`Error occured while selecting a stack. Error: ${err}`);
    }
}

function shouldDeleteStack(stack){
    return !isCurrentlyUpdating(stack) && isMoreThanOneHourOld(stack.lastUpdate);
}

function isCurrentlyUpdating(stack){
    return stack.updateInProgress;
}

function isMoreThanOneHourOld(lastUpdate) {
    const lastUpdateDate = new Date(lastUpdate);
    const currentDate = new Date();
    const timeDifference = currentDate - lastUpdateDate;
    return timeDifference > MAX_STACK_AGE_IN_MILLIS;
}

module.exports = {
    createOrDelete, executeCleanup
}