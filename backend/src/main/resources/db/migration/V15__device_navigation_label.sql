-- 固定设备分组统一更名；只迁移历史分组标题，不修改页面名称、排序、可见性或权限。
UPDATE c2k_menu_setting
SET group_title = '设备管理',
    revision = revision + 1
WHERE group_key = 'device'
  AND group_title = '设备';
