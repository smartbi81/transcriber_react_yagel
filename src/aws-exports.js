const awsConfig = {
    Auth: {
      region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
      identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID,
      userPoolId: process.env.REACT_APP_USER_POOL_ID,
      userPoolWebClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID,
    },
    Storage: {
      AWSS3: {
        bucket: 'ai.hadassah.frankfurt',
        region: process.env.REACT_APP_AWS_REGION || 'us-east-1'
      }
    }
  };
  
  export default awsConfig;
