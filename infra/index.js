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
    await stack.setConfig("aws:token", { value: process.env.AWS_SESSION_TOKEN });
    await stack.setConfig("aws:secretKey", { value: process.env.AWS_SECRET_ACCESS_KEY });
    await stack.setConfig("aws:accessKey", { value: process.env.AWS_ACCESS_KEY_ID });

    let stackConfig = await stack.getAllConfig();
    console.log(`Stack config: ${JSON.stringify(stackConfig)}`);

    console.info("refreshing stack...");
    await stack.refresh();
    console.info("refresh complete");
    console.info("refresh complete again");

    switch(action){
        case "completed":
            console.info("destroying stack...");
            await stack.destroy();
            console.info("stack destroy complete");
            break;
        case "requested":
            console.info("updating stack...");
            await stack.up({ onOutput: console.debug });
            console.info("updating stack complete");
            break;
        default:
            throw new Error(`Unknown action received! Got: [${action}]`);
    }
};

module.exports = {
    createOrDelete
}