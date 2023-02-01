const { createProbot } = require("@probot/adapter-aws-lambda-serverless");
const appFn = require("./app");
const lambda_function = require('./function');
const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });

// Create the probot and put inside it the app. The app is the "filter" on what we have to do when the function is triggered
function processEvent(event) {
    let probot = createProbot();
    probot.load(appFn);
    return lambda_function(probot, event);
}

// Handler of the function 
module.exports.webhooks = async (event) => {
    let client = new AWS.SecretsManager();
    process.env['APP_ID'] = (await client.getSecretValue({ SecretId: 'appId' }).promise()).SecretString;
    process.env['PRIVATE_KEY'] = (await client.getSecretValue({ SecretId: 'privateKey' }).promise()).SecretString;
    process.env['WEBHOOK_SECRET'] = (await client.getSecretValue({ SecretId: 'webhookSecret' }).promise()).SecretString;
    return processEvent(event);
}   
