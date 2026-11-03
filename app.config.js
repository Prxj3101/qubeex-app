// Extends app.json with values that come from the environment.
// GOOGLE_MAPS_API_KEY: Google Maps for the "My Bus" map (react-native-maps).
//   Local: put it in .env.  EAS builds: `eas env:create` (see BACKEND_DEPLOY_NOTES).
module.exports = ({ config }) => ({
    ...config,
    plugins: [
        ...(config.plugins ?? []),
        [
            'react-native-maps',
            {
                androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
                iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
            },
        ],
    ],
});
