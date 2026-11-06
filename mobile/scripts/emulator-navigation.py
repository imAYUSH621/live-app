import subprocess,time,xml.etree.ElementTree as ET,re,pathlib

def adb(*args):return subprocess.check_output(['adb',*args],text=True)
def hierarchy():
 adb('shell','uiautomator','dump','/sdcard/nav.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/nav.xml'))
def texts(root):return ' | '.join(n.get('text','')+' '+n.get('content-desc','') for n in root.iter('node'))
def wait(label):
 for _ in range(15):
  r=hierarchy()
  if label.lower() in texts(r).lower():return r
  time.sleep(2)
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
 log=adb('logcat','-d','-v','threadtime');pathlib.Path('nav-logcat.txt').write_text(log)
 assert 'FATAL EXCEPTION' not in log,'fatal logs'
 assert 'registerGlobals skipped' not in log,'registration warning'
