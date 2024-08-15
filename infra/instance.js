const aws = require("@pulumi/aws");
const { getTags } = require("./commons");

const createInstance = (identity, securityGroup, script, config) => {
    const ami = aws.ec2.getAmiOutput({
        filters: [{
            name: "name",
            values: [ config.machineImage ],
        }],
        owners: [identity.accountId],
    });

    return new aws.ec2.Instance("ghrunner", {
        monitoring: true,
        ami: ami.id,
        instanceType: config.machineType,
        tags: getTags(config.repo),
        vpcSecurityGroupIds: [ securityGroup.id ],
        userData: Buffer.from(script).toString("base64"),
        ebsBlockDevices: [{
            deviceName: "/dev/sda1",
            volumeSize: config.bootDiskSizeInGB,
            volumeType: config.bootDiskType
        }],
        instanceMarketOptions: {
            marketType: "spot"
        }
    });
}

module.exports = {
    createInstance
}