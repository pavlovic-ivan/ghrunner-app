const fetchToken = async (context, owner, repo) => {
    try {
        const response = await context.octokit.actions.createRegistrationTokenForRepo({ owner, repo });
        const registrationToken = response.data.token;
        return registrationToken;
      } catch (error) {
        console.error('Error while getting registration token:', error.message);
        throw Error(error.message);
      }
}

module.exports = {
    fetchToken
}