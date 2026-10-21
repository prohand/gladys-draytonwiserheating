# Security policy

## Supported versions

Only the latest release of the Drayton Wiser Heating integration receives
security fixes. Update the integration from the Gladys store before reporting an
issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-draytonwiserheating](https://github.com/prohand/gladys-draytonwiserheating/security),
then **Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove the hub secret, tokens and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the
Drayton Wiser HeatHub and its firmware (report to Drayton / Schneider Electric),
and the Wiser cloud.

## What the integration does with your data

- It talks to the HeatHub **on your local network only**. It never contacts the
  Wiser cloud nor any other internet service.
- The hub secret is stored by Gladys in a secret field, sent only to the hub in
  the `SECRET` header of each request, and never written to the logs.
- Second-generation hubs on a recent firmware serve HTTPS with a self-signed
  certificate they generate themselves: the integration accepts it, since there
  is no authority to check it against. Plain HTTP (older hubs) is not encrypted:
  keep the hub on a trusted network.

## Good practices for users

- Keep the hub secret only in the integration's secret field: anyone who has it
  can control your heating from your network.
- Give the hub a fixed address and keep it on your home network, not on a guest
  network.
- Keep Gladys, the integration and the hub firmware up to date.
