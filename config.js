const pointToProductionServer = !location.href.includes('8080');

const roundwareProductionURL = 'https://prod.roundware.com';
const roundwareDevelopmentProxyURL = 'https://localhost:1234';

const roundwareServerUrl = pointToProductionServer ? roundwareProductionURL : roundwareDevelopmentProxyURL;
const roundwareProjectId =  pointToProductionServer ? 29 : 1;