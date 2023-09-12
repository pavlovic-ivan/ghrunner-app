const { LocalWorkspace } = require("@pulumi/pulumi/automation");
const aws = require("@pulumi/aws");
const { createSecurityGroup } = require("./security-group");
const { createInstance } = require("./instance");
const { createStartupScript } = require("./startup-script");
const { fetchToken } = require("./token-fetcher");


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
    await retryRefresh(stack, 3, 10000);
    console.info("refresh complete");

    switch(action){
        case "completed":
            console.info("Attempting to destroy stack...");
            await retryDestroy(stack, 3, 10000);
            break;
        case "requested":
            console.info("updating stack...");
            await stack.up({ onOutput: console.info });
            console.info("updating stack complete");
            break;
        default:
            throw new Error(`Unknown action received! Got: [${action}]`);
    }
};

async function retryRefresh(stack, maxRetries, interval) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await stack.refresh();
            console.info("stack refresh complete");
            return; // if it succeeds, exit the function
        } catch (err) {
            if (i < maxRetries - 1) { // if it's not the last retry
                console.log(`Attempt ${i+1} failed. Retrying in ${interval}ms...`);
                await stack.cancel();
                await new Promise(resolve => setTimeout(resolve, interval));
            } else {
                // If it's the last retry and it failed, throw the error
                throw new Error(`The function execution failed after ${maxRetries} attempts! Error: ${err}`);
            }
        }
    }
}

async function retryDestroy(stack, maxRetries, interval) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await stack.destroy();
            console.info("stack destroy complete");
            return; // if it succeeds, exit the function
        } catch (err) {
            if (i < maxRetries - 1) { // if it's not the last retry
                console.log(`Attempt ${i+1} failed. Retrying in ${interval}ms...`);
                await stack.cancel();
                await new Promise(resolve => setTimeout(resolve, interval));
            } else {
                // If it's the last retry and it failed, throw the error
                throw new Error(`The function execution failed after ${maxRetries} attempts! Error: ${err}`);
            }
        }
    }
}

module.exports = {
    createOrDelete
}