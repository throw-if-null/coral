CREATE TABLE documents (
    id        uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    title     text NOT NULL,
    body      text NOT NULL
);
