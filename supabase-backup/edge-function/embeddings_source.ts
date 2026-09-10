import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Modelo de embeddings nativo do Supabase Edge Runtime — gratuito, sem API externa.
const model = new Supabase.ai.Session("gte-small");
Deno.serve(async (req)=>{
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  try {
    const { texts } = await req.json();
    if (!Array.isArray(texts) || texts.length === 0) {
      return new Response(JSON.stringify({
        error: "'texts' deve ser um array não vazio"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    const embeddings = [];
    for (const text of texts){
      const output = await model.run(text, {
        mean_pool: true,
        normalize: true
      });
      embeddings.push(Array.from(output));
    }
    return new Response(JSON.stringify({
      embeddings
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: String(e)
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
