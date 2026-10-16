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
$row['is_visible']=true;
$bundle=array('profile'=>array('is_published'=>true),'links'=>array($row));
verify_icon(icon_snapshot_from_bundle($bundle,$row['id'],$hash)==='example.com','Visible bundle icon');
$bundle['profile']['is_published']=false;
verify_icon(icon_snapshot_from_bundle($bundle,$row['id'],$hash)===null,'Private bundle icon');
$bundle['profile']['is_published']=true;
verify_icon(icon_snapshot_from_bundle($bundle,'00000000-0000-4000-8000-000000000099',$hash)===null,'Other link icon');
echo "Link icon checks passed\n";
