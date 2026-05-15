INSERT INTO shows (slug, name_he, name_en, type) VALUES
  ('haachim_hagdolim', 'האח הגדול',        'HaAch HaGadol',        'elimination_score'),
  ('survivor',         'שורדים',            'Survivor Israel',       'elimination_score'),
  ('master_chef',      'מאסטר שף',          'MasterChef Israel',     'elimination_score'),
  ('kohav_nolad',      'כוכב נולד',         'Kohav Nolad',           'elimination_score'),
  ('rising_star',      'הכוכב הבא',         'HaKochav HaBa',         'elimination_score')
ON CONFLICT (slug) DO NOTHING;
