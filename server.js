const app = require('./app');

const PORT = process.env.PORT || 8631;

app.listen(PORT, () => {
  console.log(`Raquel Corrêa Psicóloga rodando em http://localhost:${PORT}`);
});
