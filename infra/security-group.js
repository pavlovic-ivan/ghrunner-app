const aws = require("@pulumi/aws");
const { getTags } = require("./commons");

const createSecurityGroup = (repo) => {
    return new aws.ec2.SecurityGroup("ghrunner-sg", {
        egress: [
            { protocol: "tcp", fromPort: 0, toPort: 65535, cidrBlocks: ["0.0.0.0/0"] },
        ],
        tags: getTags(repo),
    });
}

module.exports = {
    createSecurityGroup
}