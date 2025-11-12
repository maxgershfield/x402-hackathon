using System.Text;
using System.Text.Json;
using System.Net.Http.Json;
using ScGen.Lib.Shared.DTOs.Requests;
namespace ScGen.Lib.Shared.Services.AI;

public interface IAiSmartContractService
{
    Task<Result<GenerateContractAIResponse>> GenerateAsync(GenerateContractAIRequest request, CancellationToken ct = default);
}

public sealed class AiSmartContractService : IAiSmartContractService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AiSmartContractService> _logger;

    private const string DefaultModel = "gpt-4o-mini";

    public AiSmartContractService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<AiSmartContractService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<Result<GenerateContractAIResponse>> GenerateAsync(GenerateContractAIRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Description))
        {
            return Result<GenerateContractAIResponse>.Failure(ResultPatternError.BadRequest("Description is required"));
        }

        if (!TryResolveBlockchain(request.Blockchain, out SmartContractLanguage language))
        {
            return Result<GenerateContractAIResponse>.Failure(
                ResultPatternError.BadRequest($"Unsupported blockchain '{request.Blockchain}'. Use Solana, Ethereum, or Radix."));
        }

        string? apiKey = _configuration["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return Result<GenerateContractAIResponse>.Failure(
                ResultPatternError.InternalServerError("OpenAI API key is not configured."));
        }

        try
        {
            string specJson = await GenerateSpecAsync(apiKey, request, ct);
            string? programName = TryReadProgramName(specJson);

            return Result<GenerateContractAIResponse>.Success(new GenerateContractAIResponse
            {
                Code = string.Empty,
                ZipBase64 = string.Empty,
                SpecJson = specJson,
                Language = language.ToString(),
                ProgramName = programName,
                Summary = $"AI-generated {language} contract for description: {Truncate(request.Description, 140)}",
                Recommendations = new[]
                {
                    "Review the generated code for safety and correctness.",
                    "Run compilation and deployment steps to validate.",
                    "Add unit tests covering critical business logic."
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI contract generation failed");
            return Result<GenerateContractAIResponse>.Failure(
                ResultPatternError.InternalServerError($"AI contract generation failed: {ex.Message}"));
        }
    }

    private async Task<string> GenerateSpecAsync(string apiKey, GenerateContractAIRequest request, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

        var payload = new
        {
            model = DefaultModel,
            messages = new[]
            {
                new
                {
                    role = "system",
                    content = BuildSystemPrompt(request.Blockchain)
                },
                new
                {
                    role = "user",
                    content = BuildUserPrompt(request)
                }
            },
            response_format = new { type = "json_object" },
            temperature = 0.2
        };

        using HttpResponseMessage response = await client.PostAsJsonAsync("https://api.openai.com/v1/chat/completions", payload, ct);
        if (!response.IsSuccessStatusCode)
        {
            string error = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException($"OpenAI API error: {response.StatusCode} - {error}");
        }

        using JsonDocument document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        string content = document
            .RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("OpenAI returned empty spec content.");
        }

        // Pretty-format JSON
        using JsonDocument specDoc = JsonDocument.Parse(content);
        return JsonSerializer.Serialize(specDoc, new JsonSerializerOptions { WriteIndented = true });
    }

    private static bool TryResolveBlockchain(string? blockchain, out SmartContractLanguage language)
    {
        language = SmartContractLanguage.Rust;
        string value = (blockchain ?? "solana").Trim().ToLowerInvariant();

        return value switch
        {
            "solana" or "rust" => Assign(SmartContractLanguage.Rust, out language),
            "ethereum" or "solidity" => Assign(SmartContractLanguage.Solidity, out language),
            "radix" or "scrypto" => Assign(SmartContractLanguage.Scrypto, out language),
            _ => false
        };
    }

    private static bool Assign(SmartContractLanguage value, out SmartContractLanguage language)
    {
        language = value;
        return true;
    }

    private static string BuildSystemPrompt(string blockchain)
    {
        string target = blockchain?.Trim().ToLowerInvariant() switch
        {
            "ethereum" or "solidity" => "Ethereum Solidity",
            "radix" or "scrypto" => "Radix Scrypto",
            _ => "Solana Anchor (Rust)"
        };

        return $@"You are an expert {target} smart contract architect.
Return ONLY a JSON object describing the contract specification that follows this schema:
{{
  ""imports"": [""array of import strings""],
  ""programId"": ""string"",
  ""programName"": ""snake_case_string"",
  ""instructions"": [
    {{
      ""name"": ""snake_case"",
      ""contextStruct"": ""PascalCase"",
      ""params"": [{{ ""name"": ""snake_case"", ""type"": ""Rust type string"" }}],
      ""description"": ""string"",
      ""body"": [""array of Rust code lines""]
    }}
  ],
  ""accounts"": [
    {{
      ""name"": ""PascalCase"",
      ""fields"": [{{ ""name"": ""snake_case"", ""type"": ""Rust type string"" }}]
    }}
  ],
  ""errors"": [
    {{
      ""name"": ""PascalCase"",
      ""message"": ""string"",
      ""code"": 6000
    }}
  ]
}}
Ensure the JSON is valid and contains at least one instruction and account definition.";
    }

    private static string BuildUserPrompt(GenerateContractAIRequest request)
    {
        StringBuilder sb = new();
        sb.AppendLine("Contract description:");
        sb.AppendLine(request.Description.Trim());

        if (!string.IsNullOrWhiteSpace(request.AdditionalContext))
        {
            sb.AppendLine();
            sb.AppendLine("Additional context:");
            sb.AppendLine(request.AdditionalContext.Trim());
        }

        sb.AppendLine();
        sb.AppendLine("Output only the JSON object, no commentary.");
        return sb.ToString();
    }

    private static string? TryReadProgramName(string specJson)
    {
        try
        {
            using JsonDocument doc = JsonDocument.Parse(specJson);
            return doc.RootElement.TryGetProperty("programName", out JsonElement nameElement)
                ? nameElement.GetString()
                : null;
        }
        catch
        {
            return null;
        }
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
        {
            return value;
        }
        return value[..maxLength] + "...";
    }
}


