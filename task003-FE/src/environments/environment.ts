export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  airtable: {
    authUrl: 'https://airtable.com/oauth2/v1/authorize',
    clientId: 'b29197a8-ce87-4212-8cce-b2b66a41fc6c',
    redirectUri: 'http://localhost:3000/api/airtable/callback',
    scopes: ['data.records:read', 'data.records:write', 'schema.bases:read'],
  },
};
