-- A second recharge fulfiller per cost center. fulfillRechargeRequest
-- deliberately blocks a fulfiller from approving their own request
-- (separation of duties) — with only one fulfiller ever configured, that
-- fulfiller had no one else able to approve their own recharge. With two,
-- each can approve the other's, and the self-approval block stays intact.
ALTER TABLE cost_centers
  ADD COLUMN IF NOT EXISTS default_recharge_fulfiller_id_2 UUID REFERENCES users(id);
