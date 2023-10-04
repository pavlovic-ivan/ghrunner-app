const { LocalWorkspace } = require("@pulumi/pulumi/automation");
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const { createSecurityGroup } = require("./security-group");
const { createInstance } = require("./instance");
const { createStartupScript } = require("./startup-script");
const { fetchToken } = require("./token-fetcher");

const RETRY_MAX = 10;
const RETRY_INTERVAL = 30000;
const HOUR_IN_MS = 3_600_000;

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
    await retryAction('refresh', stack.refresh, stack);
    console.info("refresh complete");

    if (action === "completed") {
        console.info("Attempting to destroy stack...");
        await retryAction('destroy', stack.destroy, stack);
    } else if (action === "requested") {
        console.info("updating stack...");
        await stack.up({ onOutput: console.info });
        console.info("updating stack complete");
    } else {
        throw new Error(`Unknown action received! Got: [${action}]`);
    }
};

async function retryAction(actionName, action, stack, maxRetries = RETRY_MAX, interval = RETRY_INTERVAL) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await action();
            console.info(`Action [${actionName}] complete`);
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
        const stacks = await ws.listStacks();
        
        console.log(JSON.stringify(stacks));
        
        for (const stack of stacks) {
            await handleStack(stack, pulumi.getProject());
        }
        
        console.log('Done executing cleanup');
    } catch (err) {
        console.log(`Error occured while executing cleanup. Error: ${err}`);
    }
}

async function handleStack(stack, projectName){
    let stackNameParts = stack.name.split('/');
    console.log(`Echo: ${JSON.stringify(stack)}, ${projectName}. ${stackNameParts}`);
    
    if(isMoreThanOneHourOld(stack.lastUpdate)){
        console.log(`Stack [${stack.name}] is more than an hour long. Deleting the stack now`);
        try {
            const selectedStack = await LocalWorkspace.selectStack({
                stackName: stack.name,
                projectName: stackNameParts[1],
                program: async () => {}
            });
            console.log(`Selected stack: ${JSON.stringify(selectedStack)}`);
            await retryAction('destroy', selectedStack.destroy, selectedStack);
            console.log(`Stack [${stack.name}] deleted`);
        } catch(err){
            console.log(`Error occured while selecting a stack. Error: ${err}`);
        }
    }
    console.log(stack.name);
}

function isMoreThanOneHourOld(lastUpdate) {
    const lastUpdateDate = new Date(lastUpdate);
    const currentDate = new Date();
    const timeDifference = currentDate - lastUpdateDate;
    return timeDifference > 3_600_000;
}

module.exports = {
    createOrDelete, executeCleanup
}