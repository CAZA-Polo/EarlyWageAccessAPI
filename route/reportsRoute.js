const express = require('express');
const { employee_onboarding_list, cash_advance_limit_issuance, cash_advance_availment } = require('../controller/reportsController');
const route = express.Router();

route.get('/employee-onboarding-list', employee_onboarding_list);
route.get('/cash-advance-limit-issuance', cash_advance_limit_issuance);
route.get('/cash-advance-availment', cash_advance_availment);

module.exports = route;