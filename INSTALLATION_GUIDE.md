# Create Github App

To create Github App:
- open the settings page of your profile in Github
- then go to Developer Settings > Github Apps
- hit the "New Github App" button
- give your app a name
- give your app a homepage, it can be whatever you want
- scroll down to section **Wehbook**
- set the **Webhook URL** to whatever, but we will come back to this later
- scroll to **Repository Permissions**
- set **Actions** permission to **Read and write**
- scroll down to **Subscribe to events** and subscribe to **Workflow job** and **Workflow run** events
- leave the **Only on this account** option set, usually it won't change
- hit the **Create GitHub App** button
- once the app is created save the **App ID**, you will need it
- scroll down to **Private keys** and hit the **Generate a private key** button
- save the `.pem` file to your filesystem and rename it to `ghapp.pem`.


Now the app needs to be installed. To do that open the **Install App** page. Select your account and hit the **Install** button. Choose one of the two options provided. Either install the app on **All repositories**, all choose the **Only selected repositories**. If you choose the **Only selected repositories**, search for the repository / repositories for which you want to install the app.


Now the app is configured and installed.
# Create GCP Role for Service Account

Go to https://console.cloud.google.com. From the project selector select your working project. Then from the menu of services select **IAM & Admin > Roles**. Hit the **+ CREATE ROLE** button. Give your Role a name and description. Then add the following permissions to it and hit **CREATE**:
```
cloudfunctions.functions.create
cloudfunctions.functions.get
cloudfunctions.functions.getIamPolicy
cloudfunctions.functions.setIamPolicy
cloudfunctions.functions.sourceCodeGet
cloudfunctions.functions.sourceCodeSet
cloudfunctions.functions.update
cloudfunctions.operations.get
iam.serviceAccounts.actAs
resourcemanager.projects.get
secretmanager.versions.access
```
Your Role is now created and it will be needed to be assigned to the Service Account.
# Create GCP Service Account

To create the Service Account, go to **IAM & Admin > Service Accounts**. Hit the **+ CREATE SERVICE ACCOUNT** button. Give your Service Account name and ID. Hit **Create and Continue** which will lead you to step 2 which is **Grant this service account access to project**. This is where you will assing your Service Account needed roles. Assign Roles:
- your custom role created above
- role: Cloud Functions Invoker

Hit the button **DONE**.
## Create key
In the list of Service Accounts, select your service acount, and go to **KEYS**. Then hit the **ADD KEY > Create new key**. Choose **JSON** format of the key. Save the file on your filesystem you will need it for later.

# Add secrets in GCP using Secrets Manager

To add secrets go to **Security > Secret Manager**. Hit the **+ CREATE SECRET** button. In the next window create a secret with:
- a name: `APP_ID`
- secret value: the id of the app create above
- leave the rest as default and hit **CREATE SECRET** button

then, create a secret with:
- a name: `PRIVATE_KEY`
- secret value: the contents of the `ghapp.pem` file (you can `cat` the file)
- leave the rest as default and hit **CREATE SECRET** button

then, create a secret with:
- a name: `WEBHOOK_SECRET`
- secret value: your desired webhook secret
- leave the rest as default and hit **CREATE SECRET** button

# Configure Github repo secrets

Go to this repository settings page. Create a **New environment** named `protected` and **Configure the environment**. Set the protection rule with **Deployment branches** set to the **Selected branches**. By default no rule is set, so select the **Add deployment branch rule**. In the **Branch name pattern** field enter **main** or **master**. Then bellow select **Add Secret** option. In the new window set:
- Name: `PROJECT_ID`
- Value: the id of your GCP project

then add a new secret with:
- Name: `SERVICE_ACCOUNT`
- Value: the id of your GCP Service Account created earlier (id is in the format of an email address)

then add a new secret with:
- Name: `SERVICE_ACCOUNT_KEY`
- Value: the contents of the service account key json file created earlier

Your environment is now all set up.

# Set Github App webhook

First deploy the function either manually as described in the [readme](./README.md), or by triggering the [deploy workflow](./.github/workflows/deploy.yml). After the deployment is done, go to https://console.cloud.google.com. Open service **Google Cloud Functions**. From the list of functions select your function and then select tab **TRIGGER**. Copy the HTTP trigger URL.

Go back to the configuration page of your Github Application:
Your Profile > Settings > Developer settings > "Your App" > Edit.

Scroll down to **Webhook** section. As the **Webhook URL** set the HTTP Trigger you saved earlier. As the Webhook secret enter the value of the `WEBHOOK_SECRET` you've created earlier.