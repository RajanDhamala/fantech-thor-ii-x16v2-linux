// Read a previously analyzed Program; never executes the imported application.
// Usage: <new-output-dir> fn:<hex-entry> refs:<hex-address>[:decimal-byte-count] ...
// Reference ranges are exact destinations, not whole-program dataflow proofs.
// @category Resa
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.nio.file.StandardOpenOption;
import java.util.LinkedHashSet;

public class TraceMouseProtocol extends GhidraScript {
    private void write(Path file, String text) throws Exception {
        Files.writeString(file, text, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
    }
    @Override
    public void run() throws Exception {
        String expected = "0c57c57868ab44cdf1c65411a66abce78bec879482dc427ddde991eac5c39b19";
        if (!expected.equals(currentProgram.getExecutableSHA256())) throw new IllegalStateException("Wrong Program SHA256");
        String[] args = getScriptArgs();
        if (args.length < 2) throw new IllegalArgumentException("Expected output directory and selections");
        Path output = Path.of(args[0]);
        Files.createDirectories(output);
        LinkedHashSet<Function> functions = new LinkedHashSet<>();
        StringBuilder refs = new StringBuilder("seed\tdestination\tsource\ttype\towner_entry\towner_name\n");
        StringBuilder seeds = new StringBuilder("selection\treference_count\n");
        for (int i = 1; i < args.length; i++) {
            String[] parts = args[i].split(":");
            Address address = toAddr(parts[1]);
            if (parts[0].equals("fn")) {
                Function function = getFunctionAt(address);
                if (function == null) throw new IllegalStateException("No exact function at " + address);
                functions.add(function);
            } else if (parts[0].equals("refs")) {
                int length = parts.length == 3 ? Integer.parseInt(parts[2]) : 1;
                if (length < 1 || length > 4096) throw new IllegalArgumentException("Reference span out of bounds");
                int count = 0;
                for (int j = 0; j < length; j++) {
                    monitor.checkCancelled();
                    Address destination = address.add(j);
                    for (Reference ref : getReferencesTo(destination)) {
                        Function owner = getFunctionContaining(ref.getFromAddress());
                        refs.append(args[i]).append('\t').append(destination).append('\t')
                            .append(ref.getFromAddress()).append('\t').append(ref.getReferenceType()).append('\t')
                            .append(owner == null ? "-" : owner.getEntryPoint()).append('\t')
                            .append(owner == null ? "-" : owner.getName()).append('\n');
                        count++;
                    }
                }
                seeds.append(args[i]).append('\t').append(count).append('\n');
            } else throw new IllegalArgumentException("Unknown selection " + args[i]);
        }
        write(output.resolve("references.tsv"), refs.toString());
        write(output.resolve("selections.tsv"), seeds.toString());
        StringBuilder status = new StringBuilder("entry\tname\tstatus\n");
        DecompInterface decompiler = new DecompInterface();
        try {
            if (!decompiler.openProgram(currentProgram)) throw new IllegalStateException(decompiler.getLastMessage());
            for (Function function : functions) {
                monitor.checkCancelled();
                DecompileResults result = decompiler.decompileFunction(function, 90, monitor);
                if (!result.decompileCompleted() || result.getDecompiledFunction() == null) {
                    status.append(function.getEntryPoint()).append('\t').append(function.getName()).append("\tFAILED: ")
                        .append(result.getErrorMessage().replace('\n',' ')).append('\n');
                    continue;
                }
                String text = "// Direct Ghidra 12.1.4 static decompilation; no runtime or hardware evidence.\n"
                    + "// Program SHA256: " + expected + "\n"
                    + "// Function: " + function.getName() + " entry: " + function.getEntryPoint() + "\n\n"
                    + result.getDecompiledFunction().getC();
                write(output.resolve(function.getEntryPoint() + ".c"), text);
                status.append(function.getEntryPoint()).append('\t').append(function.getName()).append("\tOK\n");
                println("RESA_TRACE_DECOMPILED " + function.getEntryPoint());
            }
        } finally { decompiler.dispose(); }
        write(output.resolve("functions.tsv"), status.toString());
        println("RESA_TRACE_COMPLETE " + functions.size());
    }
}
