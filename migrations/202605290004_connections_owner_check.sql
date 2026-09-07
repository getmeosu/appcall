ALTER TABLE connections
    ADD CONSTRAINT chk_connections_owner_brand
        CHECK ( (credential_owner = 'platform' AND external_account_id IS NULL)
             OR (credential_owner = 'brand'    AND external_account_id IS NOT NULL) );
