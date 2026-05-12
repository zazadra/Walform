module walform::walform {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use std::string::{String};

    /// Represents a Form created on Walform
    struct Form has key, store {
        id: UID,
        form_id: String,
        config_json: String,
        created_at: u64,
    }

    /// Represents a Submission for a specific form
    struct Submission has key, store {
        id: UID,
        form_id: String,
        payload_json: String,
        submitter: address,
        timestamp: u64,
        status: String,
    }

    /// Create a new form object and transfer it to the sender
    public fun create_form(
        form_id: String, 
        config_json: String, 
        created_at: u64,
        ctx: &mut TxContext
    ) {
        let form = Form {
            id: object::new(ctx),
            form_id,
            config_json,
            created_at,
        };
        transfer::transfer(form, tx_context::sender(ctx));
    }

    /// Register a new submission and transfer the object to the form owner for indexing
    public fun register_submission(
        form_id: String, 
        payload_json: String, 
        timestamp: u64,
        status: String,
        owner: address,
        ctx: &mut TxContext
    ) {
        let sub = Submission {
            id: object::new(ctx),
            form_id,
            payload_json,
            submitter: tx_context::sender(ctx),
            timestamp,
            status,
        };
        // Transfer the submission object to the form owner so it appears in their 'owned objects' list
        transfer::transfer(sub, owner);
    }
}
