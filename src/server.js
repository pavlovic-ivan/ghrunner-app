const { SecretsManager } = require("@aws-sdk/client-secrets-manager");
const { Probot } = require('probot');
const probotApp = require("./app");
const lowercaseKeys = require("lowercase-keys");

const client = new SecretsManager();
let probot;

exports.handler = async function (event, context) {
    // for scheduled call, no use from context, use event: {"version":"0","id":"dd651195-37b8-464f-ad01-9fd0e5e952f7","detail-type":"Scheduled Event","source":"aws.scheduler","account":"481267683326","time":"2023-09-25T14:12:07Z","region":"us-east-1","resources":["arn:aws:scheduler:us-east-1:481267683326:schedule/default/GHAppWebhookConsumerLambdaScheduleEvent"],"detail":"{}"}
    try {

        if(event.hasOwnProperty("source") && event.source === "aws.scheduler"){
            console.log("This is scheduler");
        } else {
            const [appId, privateKey, secret, pulumiPassphrase] = await Promise.all([
                getSecretValue('appId'),
                getSecretValue('privateKey'),
                getSecretValue('webhookSecret'),
                getSecretValue('pulumiPassphrase'),
            ]);
            process.env.PULUMI_CONFIG_PASSPHRASE = pulumiPassphrase;
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