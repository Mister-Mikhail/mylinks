import base64,json,os,pathlib,subprocess,tempfile
fields=["BEGET_FTP_HOST","BEGET_FTP_USER","BEGET_FTP_PASSWORD","BEGET_FTP_DIR"]
values={key:os.environ.get(key,"") for key in fields}
if not all(values.get(key) for key in fields[:3]): raise SystemExit("SOURCE_CREDENTIALS_MISSING")
with tempfile.TemporaryDirectory() as folder:
    out=pathlib.Path(folder)/"sealed.der"
    subprocess.run(["openssl","cms","-encrypt","-aes-256-cbc","-binary","-outform","DER","-out",str(out),"deploy/sweb-source/recipient.crt"],input=json.dumps(values).encode(),check=True)
    print("SWEB_SEALED_"+"MYLINKS"+"="+base64.b64encode(out.read_bytes()).decode())
