-- Originals are immutable (§33): the storage key and content hash of an asset can never change.
CREATE OR REPLACE FUNCTION prevent_original_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.original_storage_key IS DISTINCT FROM OLD.original_storage_key
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes THEN
    RAISE EXCEPTION 'media_assets original is immutable (asset %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER media_assets_original_immutable
  BEFORE UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION prevent_original_mutation();
--> statement-breakpoint
-- Edit versions are immutable once written; create a new version instead. Only is_final may flip.
CREATE OR REPLACE FUNCTION prevent_edit_version_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.storage_key IS DISTINCT FROM OLD.storage_key
     OR NEW.edl IS DISTINCT FROM OLD.edl
     OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number THEN
    RAISE EXCEPTION 'edit_versions are immutable (version %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER edit_versions_immutable
  BEFORE UPDATE ON edit_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_edit_version_mutation();
--> statement-breakpoint
-- Audit log is append-only.
-- The one permitted update is anonymisation when the owning user is deleted (ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS NULL
     AND (to_jsonb(NEW) - 'user_id') = (to_jsonb(OLD) - 'user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
