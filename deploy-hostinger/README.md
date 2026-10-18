# Deploy GO-GO Ride on Hostinger

The website, the admin panel and the API (which the Android app also uses) all run on **one Hostinger VPS**.

> **Which Hostinger plan?** A **VPS** (KVM 1 is enough to start). The API is a Python program that runs all the
> time; Hostinger's *Web*, *Cloud* and shared hosting plans cannot run it. Choose the **Ubuntu 24.04** OS template.

## What you need

- A Hostinger VPS with Ubuntu 24.04, its **IP address** and **root password** (hPanel → VPS → Overview).
- A **domain**, e.g. `gogoride.in`. In hPanel → Domains → DNS / DNS Zone add two **A records** pointing to the VPS IP:
  `@ → <VPS IP>` and `www → <VPS IP>`. DNS can take from a few minutes to a few hours.

## First install (about 10 minutes)

On this PC, in `D:\Go-Go-Ride\deploy-hostinger`:

1. **`1-make-package.bat`** — builds the website for the live server and creates `gogoride-deploy.zip`
   (website + API + the current database and uploaded files).
2. **`2-upload-and-install.bat`** — choose **1 (First install)**, enter the VPS IP, your domain and email, and type
   the VPS root password when asked (twice: upload, then install).

The install script (`setup-server.sh`) runs on the VPS and:

- sets the server clock to **Asia/Kolkata** (bus alarms fire on the right minute),
- installs Python, nginx and a free **HTTPS certificate** from Let's Encrypt (your email is registered with them and their terms accepted),
- runs the API as a service that restarts by itself, with new random secret keys in `/opt/gogoride/backend/.env`,
- serves the website at `https://yourdomain`, the API at `https://yourdomain/api`, and turns on the firewall.

### Straight after the first install

The starting database contains the **demo accounts with public passwords** (`Admin@123`, …). Before telling anyone
about the site:

1. Log in at `https://yourdomain/admin/login` as each admin (`9876500001`, `9876500002`) → Admin Profile → **change the password**.
2. Admin → Users: **block or delete** the demo passenger, bus owner and driver accounts.

## Point the Android app at the live server

```bat
cd "D:\Go-Go-Ride\go-go-ride apk"
build-apk.bat https://yourdomain/api
```

For the Play Store build also remove `"cleartext": true` and `"allowMixedContent": true` from
`go-go-ride apk\capacitor.config.json` (they only exist for testing against a plain-http server on your Wi-Fi).

## Updating later

Make your changes, then run `1-make-package.bat` and `2-upload-and-install.bat` → **2 (Update)**.
The update keeps `.env`, the database and uploads, and saves a database backup in `/opt/gogoride/backups/` first.

## Things to know before a public launch

| Topic | Status |
| --- | --- |
| **OTP sign-in** | The API has no SMS sender yet — codes are only written to the server log. The live build therefore shows **password sign-in only**. To enable OTP, connect an SMS provider (in India e.g. MSG91 or Fast2SMS; requires TRAI DLT registration) in `backend-python/app/api/auth.py`, then build with `1-make-package.bat otp`. |
| **Privacy** | Public bus endpoints currently expose owners' phone, email and ownership documents. Fix in the API before launch. |
| **Admin roles** | A normal admin can block or demote a super admin through the API. Fix before launch. |
| **Database** | SQLite on the VPS is fine to start. Backups: copy `/opt/gogoride/backend/gogoride.db` (the update script also keeps the last 10). |
| **One API worker** | Deliberate: the alarm scheduler runs inside the API process. |

## Useful commands on the VPS

```bash
journalctl -u gogoride-api -f          # live API log
systemctl restart gogoride-api         # restart the API
nano /opt/gogoride/backend/.env        # settings (restart after editing)
certbot renew --dry-run                # check certificate auto-renewal
```
