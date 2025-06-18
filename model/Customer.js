const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    customer_reference: {
        type: Number,
        required:true,
        unique: true
    },
    customer_name: {
        type: String
    },
    first_name: {
        type: String
    },
    middle_name: {
        type: String
    },
    last_name: {
        type: String
    },
    address: {
        type: String
    },
    phone_number: {
        type: String,
        unique: true,
        required: true
    },
    email_address: {
        type: String,
        unique: true,
        required: true
    },
    birthday: {
        type: Date
    },
    job_position: {
        type: String
    },
    is_employer: {
        type: Boolean,
        default: false
    },
    employees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'customer',
        unique: true
    }],
    is_deleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });


const CustomerModel = mongoose.model('customer', customerSchema);
module.exports = CustomerModel;