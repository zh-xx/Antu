# Security policy

[简体中文](SECURITY.zh-CN.md)

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Use GitHub's private report: on the repository page, **Security → Report a vulnerability**
(<https://github.com/zh-xx/Antu/security/advisories/new>). Only the maintainer sees it. Say which version
you used (`antu --version`, or the `generator` line in the page), what you did, what you expected and what
happened; a small JSON that shows the problem is the most useful thing you can attach.

If that page is not available to you, open an issue that says only that you have a security report and how to
reach you, with no details, and the maintainer will answer there.

## What to expect

Antu is a one-person project. The maintainer will read a report within about a week and say whether it is a
vulnerability, and will fix a confirmed one in the next release, sooner when it is serious. There is no bounty.
You are welcome to be named in the changelog; say if you would rather not be.

## Which versions are supported

Only the latest release. Antu is still 0.x ([versioning rules](spec/versioning.md)); a fix goes into a new
release and is not backported.

## What counts

Antu runs on your own machine. It makes no network call while it draws (a page made with it works offline), and
the command line asks once a day whether a newer version exists (`ANTU_NO_UPDATE_NOTIFIER=1` turns that off) and
sends nothing of a diagram. In scope, for example:

- a diagram file (JSON) that makes the engine, the command line or the MCP server run code or read or write a file
  it was not asked to;
- a page that runs script from the data in a diagram, or sends data out of the page;
- a published package (`@zh-xx/antu`, `@zh-xx/antu-dsh`) that does not match its source, or a flaw in the way it is
  built and published.

Not in scope: a diagram that looks wrong or a layout that is bad (open an ordinary issue), and a weakness in a
dependency that Antu does not use in a way that reaches it (report that to the dependency).

## How the packages are made

Releases are made by GitHub Actions from a commit on `main` and published to npm through npm's trusted
publisher, with provenance: each version on npm links back to the commit and the workflow run that made it.
The workflows are in [`.github/workflows/`](.github/workflows/), the rules in [CONTRIBUTING.md](CONTRIBUTING.md).
