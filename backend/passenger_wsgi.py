import sys

import os

INTERP = os.path.expanduser("/var/www/u2009426/data/www/xn--b1addb1bhgi5a2an.xn--p1ai/www")
if sys.executable != INTERP:
   os.execl(INTERP, INTERP, *sys.argv)

sys.path.append(os.getcwd())

from app import application