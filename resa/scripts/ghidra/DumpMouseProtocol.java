// Static decompilation only: never executes the imported Windows application.
// @category Resa
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.listing.Function;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.nio.file.StandardOpenOption;

public class DumpMouseProtocol extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length != 1) throw new IllegalArgumentException("Expected output directory");
        Path output = Path.of(args[0]);
        Files.createDirectories(output);
        DecompInterface decompiler = new DecompInterface();
        try {
            if (!decompiler.openProgram(currentProgram)) throw new IllegalStateException(decompiler.getLastMessage());
            String[] addresses = {"00413850", "00413940", "004139f0", "00413ac0", "00429dc0", "00429ee0"};
            for (String address : addresses) {
                monitor.checkCancelled();
                Function function = getFunctionAt(toAddr(address));
                if (function == null) throw new IllegalStateException("No exact function at " + address);
                DecompileResults result = decompiler.decompileFunction(function, 60, monitor);
                if (!result.decompileCompleted() || result.getDecompiledFunction() == null) {
                    throw new IllegalStateException("Decompile failed at " + address + ": " + result.getErrorMessage());
                }
                String text = "// Ghidra static decompilation; not original source or runtime evidence.\n"
                    + "// Program: " + currentProgram.getName() + " SHA256: " + currentProgram.getExecutableSHA256() + "\n"
                    + "// Function: " + function.getName() + " entry: " + function.getEntryPoint() + "\n\n"
                    + result.getDecompiledFunction().getC();
                Files.writeString(output.resolve(address + ".c"), text, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
                println("RESA_DECOMPILED " + address + " " + function.getName());
            }
        } finally { decompiler.dispose(); }
    }
}
