const { SecretsManager } = require("@aws-sdk/client-secrets-manager");
const { Probot } = require('probot');
const probotApp = require("./app");
const lowercaseKeys = require("lowercase-keys");

const client = new SecretsManager();
let initialized = false;
let probot;

exports.handler = async function (event, context) {
    console.log('--- Show context');
    console.log(JSON.stringify(context));
    console.log('--- End show context');
    console.log('--- Show event');
    console.log(JSON.stringify(event));
    console.log('--- End show event');
    try {
        if (!initialized){
            const [appId, privateKey, secret, pulumiPassphrase] = await Promise.all([
                getSecretValue('appId'),
                getSecretValue('privateKey'),
                getSecretValue('webhookSecret'),
                getSecretValue('pulumiPassphrase'),
            ]);
            process.env.PULUMI_CONFIG_PASSPHRASE = pulumiPassphrase;
            probot = new Probot({ appId, privateKey, secret });
            await probot.load(probotApp);
            initialized = true;
            console.log('probot initialized');
        }

        const headersLowerCase = lowercaseKeys(event.headers);

        await probot.webhooks.verifyAndReceive({
            id: headersLowerCase["x-github-delivery"],
            name: headersLowerCase["x-github-event"],
            signature:
                headersLowerCase["x-hub-signature-256"] ||
                headersLowerCase["x-hub-signature"],
            payload: event.body,
        });
    
        return {
            statusCode: 200,
            body: "Lambda function executed successfully",
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: "Internal server error",
        };
    }
};

async function getSecretValue(secretId) {
    try {
      const data = await client.getSecretValue({ SecretId: secretId });
      return data.SecretString;
    } catch (err) {
      throw err;
    }
  }