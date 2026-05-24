USE foundwise;

INSERT INTO activity_logs (user_id, action, description, entity_type, entity_id, color, created_at) VALUES
  (1, 'item_reported',    'New item reported: MacBook Pro 14\" at Library 2nd floor',    'item',  1, '#1C5C38', NOW() - INTERVAL 5 DAY),
  (2, 'item_reported',    'New item reported: Student ID Card at Cafeteria entrance',    'item',  2, '#1C5C38', NOW() - INTERVAL 4 DAY),
  (1, 'item_reported',    'New item reported: Black Leather Wallet at Engineering Bldg', 'item',  3, '#1C5C38', NOW() - INTERVAL 3 DAY),
  (2, 'item_reported',    'New item reported: Blue North Face Jacket at Outdoor quad',   'item',  4, '#1C5C38', NOW() - INTERVAL 3 DAY),
  (2, 'claim_submitted',  'Claim submitted for MacBook Pro 14\"',                         'claim', 1, '#d97706', NOW() - INTERVAL 2 DAY),
  (2, 'claim_submitted',  'Claim submitted for Student ID Card',                          'claim', 2, '#d97706', NOW() - INTERVAL 2 DAY),
  (2, 'claim_submitted',  'Claim submitted for Black Leather Wallet',                     'claim', 3, '#d97706', NOW() - INTERVAL 1 DAY),
  (1, 'claim_approved',   'Claim approved - Student ID Card returned to Demo User',       'claim', 2, '#0d9488', NOW() - INTERVAL 1 DAY),
  (1, 'claim_approved',   'Claim approved - Black Leather Wallet returned to Demo User',  'claim', 3, '#0d9488', NOW() - INTERVAL 12 HOUR),
  (1, 'item_returned',    'Black Leather Wallet returned at front desk. Owner confirmed.', 'item',  3, '#16a34a', NOW() - INTERVAL 6 HOUR);

SELECT COUNT(*) AS total_logs FROM activity_logs;
