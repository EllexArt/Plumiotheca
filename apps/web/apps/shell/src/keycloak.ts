import Keycloak from 'keycloak-js';

const keycloak: Keycloak = new Keycloak({
  url: 'http://localhost:8080', // À adapter selon votre config Keycloak
  realm: 'plumiotheca',
  clientId: 'frontend-shell',
});

export default keycloak;
