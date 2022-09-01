# Github Runner Application 

This repository contains codebase based on Probot template for Github Applications made with Javascript. Also, the backend is deployed to Google Cloud Functions. The application is listening only to `workflow_job` events, emitted when a workflow is triggered, event when restarted.

## Local setup

First read on how to [create and configure Github Application](./INSTALLATION_GUIDE.md), then come back to this guide.

Install dependencies

```
npm install
```

Start the server

```
npm start
```

Take note of the smee.io URL you've been given, stop the server, and create `.envrc` file in the root with the following contents: 

```
export WEBHOOK_PROXY_URL=<your smee.oi URL here>
export APP_ID=<app id from Github>
export PRIVATE_KEY=$(cat ghapp.pem)
```
> If you didn't create a Github Application, read about it [here](./INSTALLATION_GUIDE.md). Also, when you download the Github Application private key, rename it to ghapp.pem in place in the project root.

## Deployment

The app is continuously deployed to Google Cloud using the [`setup-gcloud` GitHub Action](https://github.com/google-github-actions/setup-gcloud). See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) for the deployment workflow.

If you wish to be able to deploy the backend to GCF manually:
- install `gcloud` installed
- install `make`
- save the Github Application .pem file in the project root as `ghapp.pem`
- save the Service Account key `.json` file in the project root as `ghrunner-app.json`
- append new environment vars to `.envrc` file
```
export GOOGLE_PROJECT=<your project id>
export GOOGLE_REGION=<your desired region>
export GOOGLE_ZONE=<your desired zone of the region>
``` 
- authorise to GCP with `gcloud login`.

Create secrets as described in [installation guide](./INSTALLATION_GUIDE.md).

now run the following to deploy the Google Cloud Function:
```
make deploy
```
## License

[ISC](LICENSE)

