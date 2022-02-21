# Backend hosting for the discord bot

This is used to host an image from your ECR repo that github actions posts to.

You need to go to parameter store and add in your Discord Token.

Parameter store should be: `DISCORDTOKEN`

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
