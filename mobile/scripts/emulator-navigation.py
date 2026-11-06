import subprocess,time,xml.etree.ElementTree as ET,re,pathlib,os,shlex

def adb(*args):return subprocess.check_output(['adb',*args],text=True)
def hierarchy():
 adb('shell','uiautomator','dump','/sdcard/nav.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/nav.xml'))
def texts(root):return ' | '.join(n.get('text','')+' '+n.get('content-desc','') for n in root.iter('node'))
def wait(label):
 for _ in range(45):
  r=hierarchy()
  if label.lower() in texts(r).lower():return r
  time.sleep(2)
 # Only initial-login failure is credential-free and safe to capture.
 if label=='Use email instead' and not pathlib.Path('nav-host-auth-home.png').exists():
  with open('nav-startup-failure.png','wb') as f:subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True)
  pathlib.Path('nav-startup-failure.xml').write_bytes(ET.tostring(r))
 if label=='Moments':
  safe=texts(r)
  for key in ['DUMMY_HOST_EMAIL','DUMMY_HOST_PASSWORD']:
   value=os.environ.get(key)
   if value:safe=safe.replace(value,'[redacted]')
  safe=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[token redacted]',safe)
  pathlib.Path('nav-auth-failure-labels.txt').write_text(safe)
 raise AssertionError('missing UI label '+label)
def tap(label):
 root=wait(label)
 nodes=[n for n in root.iter('node') if n.get('text','')==label or n.get('content-desc','')==label]
 assert nodes,'No exact control '+label
 n=next((n for n in nodes if n.get('clickable')=='true'),nodes[0]); nums=list(map(int,re.findall(r'\d+',n.get('bounds'))))
 adb('shell','input','tap',str((nums[0]+nums[2])//2),str((nums[1]+nums[3])//2))
 time.sleep(1)
def capture(label):
 root=hierarchy();pathlib.Path('nav-'+label+'.xml').write_bytes(ET.tostring(root))
 with open('nav-'+label+'.png','wb') as f:subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True)
 print(label,texts(root))
try:
 adb('install','-r','ci-apks/app-release-test-plain.apk');adb('logcat','-c')
 adb('shell','svc','power','stayon','true');adb('shell','input','keyevent','KEYCODE_WAKEUP')
 adb('shell','monkey','-p','com.liveapp.live','-c','android.intent.category.LAUNCHER','1')
 wait('Use email instead');capture('plain-login')
 tap('Use email instead');wait('Email');capture('email-mode')
 # Deliberately no email, phone, password, OTP or auth submission.
 adb('shell','am','force-stop','com.liveapp.live')
 adb('shell','monkey','-p','com.liveapp.live','-c','android.intent.category.LAUNCHER','1')
 wait('Use email instead');capture('relaunch')
 print('NAVIGATION_RELAUNCH_PASS')
 # Optional approved dummy credentials are injected as masked runner secrets.
 if os.environ.get('DUMMY_HOST_PASSWORD'):
  tap('Use email instead');r=wait('Email')
  for index,value in enumerate([os.environ['DUMMY_HOST_EMAIL'],os.environ['DUMMY_HOST_PASSWORD']]):
   inputs=[n for n in hierarchy().iter('node') if n.get('class')=='android.widget.EditText']
   assert len(inputs)>=2
   node=inputs[index]
   x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')))
   adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
   subprocess.run(['adb','shell','input','text',shlex.quote(value.replace(' ','%s'))],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  adb('shell','input','keyevent','KEYCODE_BACK')
  r=hierarchy()
  consent=next(n for n in r.iter('node') if 'I confirm I am' in n.get('text',''))
  x1,y1,x2,y2=map(int,re.findall(r'\d+',consent.get('bounds')))
  adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
  tap('Sign In');wait('Moments');capture('host-auth-home')
  tap('Me');capture('host-auth-profile');tap('Live');capture('host-auth-live')
  adb('shell','am','force-stop','com.liveapp.live')
  adb('shell','monkey','-p','com.liveapp.live','-c','android.intent.category.LAUNCHER','1')
  wait('Moments');capture('host-auth-session-relaunch')
  print('HOST_PASSWORD_AUTH_TABS_SESSION_PASS')
  # Remove dummy app data to exercise independent guest authentication afterward.
  adb('shell','pm','clear','com.liveapp.live')
  adb('shell','monkey','-p','com.liveapp.live','-c','android.intent.category.LAUNCHER','1');wait('Use email instead')
 # Use the real guest-auth path, no OTP/password and no session injection.
 for _ in range(3):
  if 'Explore as Guest' in texts(hierarchy()):break
  adb('shell','input','swipe','500','1900','500','600','500');time.sleep(1)
 tap('Explore as Guest');wait('Moments');capture('guest-home')
 tap('Me');capture('guest-profile')
 tap('Chats');capture('guest-chats')
 tap('Moments');capture('guest-moments')
 tap('Live');capture('guest-return-home')
 adb('shell','am','force-stop','com.liveapp.live')
 adb('shell','monkey','-p','com.liveapp.live','-c','android.intent.category.LAUNCHER','1')
 wait('Moments');capture('guest-session-relaunch')
 print('GUEST_AUTH_TABS_SESSION_RELAUNCH_PASS')
finally:
 log=adb('logcat','-d','-v','threadtime')
 if not os.environ.get('DUMMY_HOST_PASSWORD'):pathlib.Path('nav-logcat.txt').write_text(log)
 else:
  safe='\n'.join(x for x in log.splitlines() if 'ReactNativeJS' in x or 'FATAL EXCEPTION' in x)
  for key in ['DUMMY_HOST_EMAIL','DUMMY_HOST_PASSWORD']:
   value=os.environ.get(key)
   if value:safe=safe.replace(value,'[redacted]')
  safe=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[token redacted]',safe)
  pathlib.Path('nav-app-diagnostics.txt').write_text(safe)
 assert 'FATAL EXCEPTION' not in log,'fatal logs'
 assert 'registerGlobals skipped' not in log,'registration warning'
