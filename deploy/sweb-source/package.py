import base64,hashlib,json,os,pathlib,subprocess,tempfile,urllib.request
repo=os.environ["GITHUB_REPOSITORY"]
with tempfile.TemporaryDirectory() as folder:
    archive=pathlib.Path(folder)/"mylinks-release.tar.gz"
    subprocess.run(["tar","-czf",str(archive),"-C","dist","."],check=True)
    data=archive.read_bytes()
    if len(data)>8*1024*1024:raise SystemExit("Bundle too large for this transfer")
    encoded=base64.b64encode(data).decode("ascii");chunks=[]
    for offset in range(0,len(encoded),131072):
        body=json.dumps({"content":encoded[offset:offset+131072],"encoding":"utf-8"}).encode()
        req=urllib.request.Request("https://api.github.com/repos/"+repo+"/git/blobs",data=body,method="POST",headers={"Authorization":"Bearer "+os.environ["GH_TOKEN"],"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"})
        with urllib.request.urlopen(req,timeout=45) as result:chunks.append(json.load(result)["sha"])
    print("SWEB_BUNDLE_MANIFEST="+json.dumps(dict(chunks=chunks,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),source=os.environ["GITHUB_SHA"])),flush=True)
