module.exports = {
    apps: [
        {
            name: 'dexpulse-dashboard',
            script: 'npm',
            args: 'run dev',
            env: {
                NODE_ENV: 'production',
                PORT: 5173
            }
        },
        {
            name: 'monitor-live',
            script: 'node',
            args: 'monitor-live.mjs',
            watch: false
        }
    ]
};
