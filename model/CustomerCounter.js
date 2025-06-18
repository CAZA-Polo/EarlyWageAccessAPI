const mongoose = require('mongoose');

const customerCounterSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // The identifier, e.g., 'account'
    sequence_value: { type: Number, default: 1 } // Starting point (adjust as needed)
});

const CustomerCounterModel = mongoose.model('customerCounter', customerCounterSchema);
module.exports = CustomerCounterModel;
