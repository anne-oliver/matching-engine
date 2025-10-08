const path = require('path');
const Dotenv = require('dotenv-webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './client/src/index.jsx',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'client/dist'),
    publicPath: '/'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        include: path.resolve(__dirname, 'client/src'),
        use: { loader: 'babel-loader' }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: { extensions: ['.js', '.jsx'] },
  devServer: {
    static: { directory: path.join(__dirname, 'client/dist') },
    port: 5173,
    hot: true,
    historyApiFallback: true,
    proxy: [
      {
        context: ['/orders', '/metrics', '/trades', '/admin', '/book'],
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    ],
  },
  plugins: [
    new Dotenv(),
    new HtmlWebpackPlugin({
      template: './client/public/index.html',
    }),
  ]
};

