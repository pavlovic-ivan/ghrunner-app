const { SecretsManager } = require("@aws-sdk/client-secrets-manager");
const { Probot } = require('probot');
const probotApp = require("./app");
const { executeCleanup, cleanupRemoteStateFiles } = require("../infra");
const lowercaseKeys = require("lowercase-keys");
const { App } = require("@octokit/app");
const _ = require('lodash');

const client = new SecretsManager();
let probot;

exports.handler = async function (event, context) {
    try {
        const [appId, privateKey, secret, pulumiPassphrase] = await Promise.all([
            getSecretValue('appId'),
            getSecretValue('privateKey'),
            getSecretValue('webhookSecret'),
            getSecretValue('pulumiPassphrase'),
        ]);
        process.env.PULUMI_CONFIG_PASSPHRASE = pulumiPassphrase;

        if(_.has(event, "type") && _.isEqual(event.type, "scheduler")){
            const app = new App({ appId, privateKey });
            if(_.eq(event.name, "SchedulerRemoveRemoteStateFiles") && _.isEqual(event.enabled, true)){
                console.log('Scheduler enabled');
                // await cleanupRemoteStateFiles();
            } else if(_.eq(event.name, "SchedulerRogueInstanceCleanup") && _.isEqual(event.enabled, true)){
                console.log('Scheduler enabled');
                // await executeCleanup(app);
            } else {
                console.log(`Unknown scheduler, or scheduler [${event.name}] is disabled`);
            }
        } else {
            probot = new Probot({ appId, privateKey, secret });
            await probot.load(probotApp);
    
            const headersLowerCase = lowercaseKeys(event.headers);
    
            await probot.webhooks.verifyAndReceive({
                id: headersLowerCase["x-github-delivery"],
                name: headersLowerCase["x-github-event"],
                signature:
                    headersLowerCase["x-hub-signature-256"] ||
                    headersLowerCase["x-hub-signature"],
                payload: event.body,
            });
        }
    
        return {
            statusCode: 200,
            body: "Lambda function executed",
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