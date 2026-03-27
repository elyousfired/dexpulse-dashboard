module.exports = {
    apps: [
        {
            name: 'dexpulse-dashboard',
            script: 'npm',
            args: 'run dev',
            env: {
                NODE_ENV: 'production',
                PORT: 3000
            }
        },
        {
            name: 'vwap-tsl',
            script: 'node',
            args: 'vwap-tsl-standalone.mjs',
            watch: false,
            autorestart: true,
            restart_delay: 10000
        }
    ]
};
