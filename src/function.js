module.exports = lambdaFunction;
const app = require("./app");

const lowercaseKeys = require("lowercase-keys");

async function lambdaFunction(probot, event) {
  try {
    // lowercase all headers to respect headers insensitivity (RFC 7230 $3.2 'Header Fields', see issue #62)
    const headersLowerCase = lowercaseKeys(event.headers);

    // this will be simpler once we ship `verifyAndParse()`
    // see https://github.com/octokit/webhooks.js/issues/379
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
      body: '{"ok": "everything went well"}',
    };
  } catch (error) {
    return {
      statusCode: error.status || 500,
      error: '{"error" : "Somethig went wrong. You should check the probot\'s informations"}',
    };
  }
}