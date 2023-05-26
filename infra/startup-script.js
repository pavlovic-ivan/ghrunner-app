const fs = require('fs');
const Mustache = require("mustache");

const createStartupScript = (stackName, config, token) => {
    const templateView = {
        owner: config.owner,
        repo: config.repo,
        labels: config.labels,
        runner_name: stackName,
        token: token
    };
    const template = fs.readFileSync('./register-runner.sh', 'utf-8');
    // Disable all escaping
    Mustache.escape = (text) => {
        return text;
    };
    return Mustache.render(template, templateView);
}

module.exports = {
    createStartupScript
}