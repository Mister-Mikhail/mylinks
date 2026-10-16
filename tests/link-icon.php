<?php
define('MYLINKS_ICON_LIBRARY_ONLY',true);
require __DIR__ . '/../public/link-icon.php';
function verify_icon($condition,$message) { if (!$condition) throw new Exception($message); }
$row=array('id'=>'00000000-0000-4000-8000-000000000002','url'=>'https://example.com/page','is_visible'=>true);
$hash=substr(md5($row['url']),0,12);
verify_icon(icon_snapshot_details($row,$hash)==='example.com','Icon host');
verify_icon(icon_snapshot_details($row,'000000000000')===null,'Old URL accepted');
$row['is_visible']=false;
verify_icon(icon_snapshot_details($row,$hash)===null,'Hidden link accepted');
echo "Link icon checks passed\n";
