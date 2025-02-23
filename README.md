<h1 align="center" style="border-bottom: none">
    <div>
        <a style="color:#36f" href="https://www.nocodb.truva.in">
            <img src="/packages/nc-gui/assets/img/brand/truva-logo-small.svg" width="100" />
            <br>
            <img src="/packages/nc-gui/assets/img/icons/512x512.png" width="80" />
            <br>
            NocoDB for Truva
        </a>
        <p align="center">
          <a href="https://github.com/truvahomes/nocodb/actions/workflows/truva.yml">
            <img src="https://github.com/truvahomes/nocodb/actions/workflows/truva.yml/badge.svg" alt="Release : Docker for Truva">
          </a>
        </p>
    </div>
    The Open Source Airtable Alternative <br>
</h1>

<p align="center">
NocoDB is the fastest and easiest way to build databases online.
</p>

<p align="center">
    <a href="http://www.nocodb.com"><b>Website</b></a> •
    <a href="https://discord.gg/5RgZmkW"><b>Discord</b></a> •
    <a href="https://community.nocodb.com/"><b>Community</b></a> •
    <a href="https://twitter.com/nocodb"><b>Twitter</b></a> •
    <a href="https://www.reddit.com/r/NocoDB/"><b>Reddit</b></a> •
    <a href="https://docs.nocodb.com/"><b>Documentation</b></a>
</p>

# Installation

## Docker with SQLite

```bash 
docker run -d \
  --name noco \
  -v "$(pwd)"/nocodb:/usr/app/data/ \
  -p 8080:8080 \
  nocodb/nocodb:latest
  ```

## Docker with MySQL
```bash
docker run -d \
  --name noco \
  -v "$(pwd)"/nocodb:/usr/app/data/ \
  -p 8080:8080 \
  -e NC_DB="mysql2://host.docker.internal:3306?u=admin&p=password&d=nocodb_metadata \
  nocodb/nocodb:latest
```

> When running locally access nocodb by visiting: [http://localhost:8080/dashboard](http://localhost:8080/dashboard)

For more installation methods, please refer to [docs](https://docs.nocodb.com/category/installation)

# Contributing

Please refer to [Contribution Guide](https://github.com/nocodb/nocodb/blob/master/.github/CONTRIBUTING.md).

# License

<p>
This project is licensed under <a href="./LICENSE">AGPLv3</a>.
</p>
