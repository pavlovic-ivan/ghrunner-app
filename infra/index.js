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
    await stack.refresh();
    console.info("refresh complete");
    console.info("refresh complete again");

    console.info("STACK INFO GET");
    console.info(stack.info());
    console.info("STACK INFO DONE");

    switch(action){
        case "completed":
            let retries = 3;
            while (retries > 0) {
                try {
                    console.info("destroying stack...");
                    await stack.destroy();
                    console.info("stack destroy complete");
                    break;
                } catch (err) {
                    console.info("Destroying stack failed:", err);
                    retries--;
                    if (retries === 0) {
                        console.log("No more retries, exiting...");
                        throw err;
                    }
                    console.log(`Retries left: ${retries}. Retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
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

module.exports = {
    createOrDelete
}