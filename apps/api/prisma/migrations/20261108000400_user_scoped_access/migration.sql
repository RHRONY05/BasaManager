-- 0004 user-scoped access without an org context (03-DATABASE.md "RLS"). Hand-written, expand-only.
--
-- "List my organisations" (login, GET /api/me, org switcher) and "preview/accept an invite by token" run with
-- ctx { orgId: null, userId }. Before this migration memberships/invitations/organizations were only visible in
-- their own org's context, so those reads returned nothing under bm_app.

-- 1. memberships: a signed-in user may READ their own memberships in every org (and nothing else).
--    Permissive, so OR-ed with org_isolation; SELECT only (writes still need the org context).
--    Only in a context WITHOUT an org: inside org A, `membership.findMany()` must return A's rows only,
--    not also the caller's memberships in B and C.
CREATE POLICY own_memberships ON memberships FOR SELECT
  USING (nullif(current_setting('app.org_id', true), '') IS NULL
         AND user_id = nullif(current_setting('app.user_id', true), '')::uuid);

-- 2. organizations: split org_self (which covered ALL commands) per command.
--    No DELETE policy: organisations are never deleted (suspended instead), so DELETE matches no rows.
DROP POLICY org_self ON organizations;

-- Read: own org context, or the platform-admin context (unchanged behaviour).
CREATE POLICY org_self_select ON organizations FOR SELECT
  USING (id = nullif(current_setting('app.org_id', true), '')::uuid
         OR current_setting('app.is_admin', true) = 'true');

-- Read: every org the signed-in user has a membership in (any status: removed tenants keep read-only
-- history), again only without an org context (in org A the caller sees org A only). The subquery runs
-- under the memberships policies; own_memberships makes the user's rows visible.
-- No recursion: no memberships policy refers to organizations.
CREATE POLICY member_orgs ON organizations FOR SELECT
  USING (nullif(current_setting('app.org_id', true), '') IS NULL AND EXISTS (
    SELECT 1 FROM memberships m
     WHERE m.org_id = organizations.id
       AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid));

-- Create: the new org's id must be the transaction's app.org_id (the service generates it first).
CREATE POLICY org_self_insert ON organizations FOR INSERT
  WITH CHECK (id = nullif(current_setting('app.org_id', true), '')::uuid);

-- Change: the landlord of that org, or the platform-admin context (suspend / reactivate).
CREATE POLICY org_self_update ON organizations FOR UPDATE
  USING ((id = nullif(current_setting('app.org_id', true), '')::uuid
          AND nullif(current_setting('app.role', true), '') = 'landlord')
         OR current_setting('app.is_admin', true) = 'true')
  WITH CHECK ((id = nullif(current_setting('app.org_id', true), '')::uuid
               AND nullif(current_setting('app.role', true), '') = 'landlord')
              OR current_setting('app.is_admin', true) = 'true');

-- 3. invitations: look one up by its token hash without an org context. SECURITY DEFINER runs as the owner
--    (bm_owner, superuser, so RLS does not apply inside); it returns at most the one row whose hash matches
--    and only these columns (never token_hash). The service checks expiry/acceptance/revocation and then
--    accepts inside db.$tx({ orgId: <row.org_id>, … }).
CREATE FUNCTION app_find_invitation(p_token_hash bytea)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  email citext,
  role invitation_role,
  building_ids uuid[],
  lease_id uuid,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.org_id, i.email, i.role, i.building_ids, i.lease_id, i.expires_at, i.accepted_at,
         i.revoked_at, i.invited_by
    FROM public.invitations i
   WHERE i.token_hash = p_token_hash
$$;

REVOKE ALL ON FUNCTION app_find_invitation(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_find_invitation(bytea) TO bm_app;
